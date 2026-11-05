import { useMemo, useState } from 'react'
import { BookOpen, Brain, Check, ChevronRight, ClipboardList, Clock3, Import, Layers3, PencilLine, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/Common'
import { CardTestMode } from '../components/cards/CardTestMode'
import { ImportWords } from '../components/cards/ImportWords'
import { useWorkspace } from '../hooks/useWorkspace'
import { isDue, isNew, reviewCard, type ReviewGrade } from '../lib/cards'
import { familyByEntry, type LemmaFamily } from '../lib/lemma'
import { moduleTitle } from '../lib/themeTitles'
import { useI18n } from '../lib/i18n'
import { formatTimecode } from '../lib/transcript'
import type { CardProgress, PodcastShow, VocabularyEntry } from '../types'

type DeckStatus = 'all' | 'due' | 'new' | 'learned'
interface DeckFilter { language: 'all' | PodcastShow['language']; episodeId: 'all' | string; status: DeckStatus }

function orderedCards(entries: VocabularyEntry[], progress: Map<string, CardProgress>, filter: DeckFilter): VocabularyEntry[] {
  return entries.filter((entry) => {
    if (filter.language !== 'all' && entry.language !== filter.language) return false
    if (filter.episodeId !== 'all' && entry.episodeId !== filter.episodeId) return false
    const card = progress.get(entry.id)
    if (filter.status === 'due') return !isNew(card) && isDue(card)
    if (filter.status === 'new') return isNew(card)
    if (filter.status === 'learned') return !isNew(card)
    return true
  }).sort((left, right) => {
    const a = progress.get(left.id)
    const b = progress.get(right.id)
    const aNew = isNew(a) ? 1 : 0
    const bNew = isNew(b) ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    const aDue = a ? new Date(a.dueAt).getTime() : 0
    const bDue = b ? new Date(b.dueAt).getTime() : 0
    return aDue - bDue || left.createdAt.localeCompare(right.createdAt)
  })
}

function collapseToFamilyRepresentatives(entries: VocabularyEntry[], families: Map<string, LemmaFamily>): VocabularyEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const family = families.get(entry.id)
    if (!family) return true
    if (seen.has(family.key)) return false
    seen.add(family.key)
    return true
  })
}

export function CardsView() {
  const { state, saveCardProgress } = useWorkspace()
  const theme = state.settings.theme
  const { t, locale } = useI18n()
  const [filter, setFilter] = useState<DeckFilter>({ language: 'all', episodeId: 'all', status: 'all' })
  const [revealed, setRevealed] = useState(false)
  const [mode, setMode] = useState<'review' | 'test'>('review')
  const [showImport, setShowImport] = useState(false)
  const [representativesOnly, setRepresentativesOnly] = useState(false)
  const progress = useMemo(() => new Map(state.cardProgress.map((card) => [card.vocabularyId, card])), [state.cardProgress])
  const families = useMemo(() => familyByEntry(state.vocabulary), [state.vocabulary])
  const familyGroupCount = useMemo(() => new Set([...families.values()].map((family) => family.key)).size, [families])
  const [currentId, setCurrentId] = useState<string | null>(() => orderedCards(state.vocabulary, new Map(), { language: 'all', episodeId: 'all', status: 'all' })[0]?.id ?? null)
  const fullDeck = orderedCards(state.vocabulary, progress, filter)
  const deck = representativesOnly ? collapseToFamilyRepresentatives(fullDeck, families) : fullDeck
  const current = currentId === null ? undefined : deck.find((entry) => entry.id === currentId) ?? deck[0]
  const episodeById = useMemo(() => new Map(state.episodes.map((episode) => [episode.id, episode])), [state.episodes])
  const showById = useMemo(() => new Map(state.shows.map((show) => [show.id, show])), [state.shows])
  const newCount = state.vocabulary.filter((entry) => isNew(progress.get(entry.id))).length
  const dueCount = state.vocabulary.filter((entry) => !isNew(progress.get(entry.id)) && isDue(progress.get(entry.id))).length
  const learnedCount = state.vocabulary.length - newCount
  const episode = current ? episodeById.get(current.episodeId) : undefined
  const show = episode ? showById.get(episode.showId) : undefined

  const changeFilter = (patch: Partial<DeckFilter>) => {
    const next = { ...filter, ...patch }
    setFilter(next)
    setCurrentId(orderedCards(state.vocabulary, progress, next)[0]?.id ?? null)
    setRevealed(false)
  }

  const chooseCard = (id: string) => { setCurrentId(id); setRevealed(false) }

  const grade = (value: ReviewGrade) => {
    if (!current) return
    const reviewed = { ...reviewCard(progress.get(current.id), value), vocabularyId: current.id }
    saveCardProgress(reviewed)
    const nextProgress = new Map(progress)
    nextProgress.set(current.id, reviewed)
    const next = orderedCards(state.vocabulary, nextProgress, filter).find((entry) => entry.id !== current.id && isDue(nextProgress.get(entry.id)))
      ?? orderedCards(state.vocabulary, nextProgress, filter).find((entry) => entry.id !== current.id)
    setCurrentId(next?.id ?? null)
    setRevealed(false)
  }

  const restart = () => { setCurrentId(deck[0]?.id ?? null); setRevealed(false) }

  return (
    <div className="page-wrap cards-page">
      <PageHeader
        view="cards"
        kicker={t('VOCABULARY / SPACED REPETITION')}
        title={t(moduleTitle(theme, 'cards'))}
        copy={t('Every saved vocabulary entry becomes a card automatically — and whole word lists import in one batch. Review locally with Anki-style Again, Hard, Good, and Easy scheduling, or run a Quizlet-style written test: built locally for free, or by the site’s AI for harder distractors. No AnkiWeb account or synchronization.')}
        actions={<div className="cards-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowImport((value) => !value)}><Import size={16} />{t(showImport ? 'Close import' : 'Import words')}</button><div className="cards-mode" role="group" aria-label={t('Deck mode')}><button type="button" className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}><PencilLine size={15} />{t('Review')}</button><button type="button" className={mode === 'test' ? 'active' : ''} onClick={() => setMode('test')}><ClipboardList size={15} />{t('Test')}</button></div></div>}
      />

      {showImport && <ImportWords />}

      <div className="card-stats" aria-label={t('Vocabulary review statistics')}>
        <div><span>{t('TOTAL CARDS')}</span><strong>{state.vocabulary.length}</strong><small>{t('Imported directly from marked words')}</small></div>
        <div><span>{t('NEW')}</span><strong>{newCount}</strong><small>{t('Not yet reviewed')}</small></div>
        <div><span>{t('DUE NOW')}</span><strong>{dueCount}</strong><small>{t('Learned cards awaiting review')}</small></div>
        <div><span>{t('LEARNED')}</span><strong>{learnedCount}</strong><small>{t('With local scheduling history')}</small></div>
      </div>

      {!state.vocabulary.length ? <section className="cards-empty"><Layers3 size={34} /><h2>{t('Your deck is waiting for its first word')}</h2><p>{t('Mark words while reading in Listen & Read, or import a whole word list in one batch — both become cards immediately.')}</p><div className="guide-actions"><button type="button" className="btn btn-primary" onClick={() => setShowImport(true)}><Import size={16} />{t('Import words in one batch')}</button><a className="btn btn-secondary" href="#/study"><BookOpen size={16} />{t('Open Listen & Read')}</a></div></section> : <>
        <section className="deck-shelf" aria-labelledby="deck-shelf-title">
          <div><span className="section-index">{t('01 / DECKS')}</span><h2 id="deck-shelf-title">{t('Choose a vocabulary deck')}</h2></div>
          <div className="deck-shelf-grid">
            <DeckButton title={t('All marked words')} meta={t('{count} cards · {due} due', { count: state.vocabulary.length, due: dueCount })} active={filter.language === 'all' && filter.episodeId === 'all'} onClick={() => changeFilter({ language: 'all', episodeId: 'all' })} />
            {(['English', 'Deutsch', 'Chinese'] as const).map((language) => {
              const entries = state.vocabulary.filter((entry) => entry.language === language)
              if (!entries.length) return null
              const due = entries.filter((entry) => isDue(progress.get(entry.id))).length
              return <DeckButton key={language} title={t(language)} meta={t('{count} cards · {due} due', { count: entries.length, due })} active={filter.language === language} onClick={() => changeFilter({ language, episodeId: 'all' })} />
            })}
          </div>
          <div className="deck-filters">
            <label><span>{t('Episode subdeck')}</span><select className="field" value={filter.episodeId} onChange={(event) => changeFilter({ episodeId: event.target.value })}><option value="all">{t('All episodes')}</option>{state.episodes.filter((item) => state.vocabulary.some((entry) => entry.episodeId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label><span>{t('Card state')}</span><select className="field" value={filter.status} onChange={(event) => changeFilter({ status: event.target.value as DeckStatus })}><option value="all">{t('All cards')}</option><option value="due">{t('Due learned cards')}</option><option value="new">{t('New cards')}</option><option value="learned">{t('Learned cards')}</option></select></label>
            {familyGroupCount > 0 && <label className="deck-family-toggle"><input type="checkbox" checked={representativesOnly} onChange={(event) => { setRepresentativesOnly(event.target.checked); setRevealed(false) }} /><span>{t('One card per word family (lemma)')}</span></label>}
          </div>
          {familyGroupCount > 0 && <p className="deck-family-note">{t('{cards} cards share {families} word families — same lemma, different forms. Families are marked for review, never merged or deleted.', { cards: families.size, families: familyGroupCount })}</p>}
        </section>

        {mode === 'test' ? <CardTestMode deck={deck} all={state.vocabulary} /> : <>
        <section className="review-desk" aria-labelledby="review-desk-title">
          <div className="review-desk-heading"><div><span className="section-index">{t('02 / REVIEW')}</span><h2 id="review-desk-title">{t('Recall before revealing')}</h2></div><span>{deck.length ? t('{position} of {count}', { position: Math.max(1, deck.findIndex((entry) => entry.id === current?.id) + 1), count: deck.length }) : t('0 cards')}</span></div>
          {current ? <>
            <button type="button" className={`flashcard ${revealed ? 'is-revealed' : ''}`} onClick={() => setRevealed((value) => !value)} aria-label={revealed ? t('Hide card answer') : t('Reveal card answer')}>
              <span className="flashcard-side">{revealed ? t('BACK / ANSWER') : t('FRONT / RECALL')}</span>
              <strong>{current.surface}</strong>
              {!revealed ? <><p>{current.context || t('No sentence context was saved.')}</p><small>{t('Tap to reveal the translation and source')}</small></> : <><p className="flashcard-translation">{current.translation || t('No translation saved yet')}</p><div className="flashcard-source"><span>{show?.shortName ?? t('Unknown show')}</span><strong>{episode?.title ?? t('Unknown episode')}</strong><small>{current.startSeconds === null ? t('No timestamp') : formatTimecode(current.startSeconds)} · {t(current.language)}</small></div></>}
            </button>
            {!revealed ? <button type="button" className="btn btn-primary show-answer" onClick={() => setRevealed(true)}>{t('Show answer')}<ChevronRight size={17} /></button> : <div className="grade-row" role="group" aria-label={t('Rate this card')}>
              <GradeButton label={t('Again')} hint={t('10 min')} tone="again" onClick={() => grade('again')} />
              <GradeButton label={t('Hard')} hint={t('Shorter interval')} tone="hard" onClick={() => grade('hard')} />
              <GradeButton label={t('Good')} hint={t('Standard interval')} tone="good" onClick={() => grade('good')} />
              <GradeButton label={t('Easy')} hint={t('Longer interval')} tone="easy" onClick={() => grade('easy')} />
            </div>}
            <div className="review-meta"><Clock3 size={14} /><span>{progress.get(current.id)?.lastReviewedAt ? t('Last reviewed {date}', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(progress.get(current.id)?.lastReviewedAt ?? '')) }) : t('New card · first review')}</span><button type="button" className="text-link" onClick={() => setRevealed((value) => !value)}>{revealed ? t('Show prompt') : t('Show answer')}</button></div>
            {families.has(current.id) && <p className="flashcard-family"><Layers3 size={13} />{t('Same word family:')}{families.get(current.id)!.memberIds.filter((id) => id !== current.id).map((id) => { const entry = state.vocabulary.find((item) => item.id === id); return entry ? <button key={id} type="button" className="text-link" onClick={() => chooseCard(entry.id)}>{entry.surface}</button> : null })}</p>}
          </> : <div className="review-complete"><Check size={30} /><h3>{deck.length ? t('This review round is complete') : t('No cards match this deck filter')}</h3><p>{deck.length ? t('You can restart the filtered deck or choose another language, episode, or card state.') : t('Choose All cards or another deck to continue.')}</p>{deck.length > 0 && <button type="button" className="btn btn-secondary" onClick={restart}><RotateCcw size={16} />{t('Review this deck again')}</button>}</div>}
        </section>
        </>}

        {mode === 'review' && deck.length > 1 && <section className="card-browser" aria-labelledby="card-browser-title"><div><span className="section-index">{t('03 / BROWSE')}</span><h2 id="card-browser-title">{t('Jump to a card')}</h2></div><div>{deck.slice(0, 24).map((entry) => <button type="button" key={entry.id} className={current?.id === entry.id ? 'active' : ''} onClick={() => chooseCard(entry.id)}><Brain size={14} /><strong>{entry.surface}</strong>{families.has(entry.id) && <em className="lemma-badge" title={t('Same word family: {forms}', { forms: families.get(entry.id)!.surfaces.join(', ') })}>{t('family ×{count}', { count: families.get(entry.id)!.memberIds.length })}</em>}<small>{isNew(progress.get(entry.id)) ? t('New') : isDue(progress.get(entry.id)) ? t('Due') : t('Scheduled')}</small></button>)}</div></section>}
      </>}

      <p className="local-review-note"><Layers3 size={15} />{t('Local review by default; the AI test builder is optional, requires sign-in, and is billed to the site owner. Card schedules are included in workspace JSON backups; this site does not connect to or sync with AnkiWeb or Quizlet.')}</p>
    </div>
  )
}

function DeckButton({ title, meta, active, onClick }: { title: string; meta: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'active' : ''} aria-pressed={active} onClick={onClick}><Layers3 size={18} /><span><strong>{title}</strong><small>{meta}</small></span><ChevronRight size={16} /></button>
}

function GradeButton({ label, hint, tone, onClick }: { label: string; hint: string; tone: ReviewGrade; onClick: () => void }) {
  return <button type="button" className={`grade-${tone}`} onClick={onClick}><strong>{label}</strong><small>{hint}</small></button>
}
