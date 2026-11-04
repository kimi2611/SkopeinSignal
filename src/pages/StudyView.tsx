import { useEffect, useMemo, useState } from 'react'
import { AudioLines, BookMarked, FileOutput, FileText, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/Common'
import { HandoffPanel } from '../components/study/HandoffPanel'
import { NotesPanel } from '../components/study/NotesPanel'
import { StudyPlayer, type SeekRequest, type WordSelection } from '../components/study/StudyPlayer'
import { StudySetup } from '../components/study/StudySetup'
import { TranscriptRequestPanel } from '../components/study/TranscriptRequestPanel'
import { VocabularyPanel } from '../components/study/VocabularyPanel'
import { WordDialog } from '../components/study/WordDialog'
import { EpisodeDossier } from '../components/learning/EpisodeDossier'
import { WorkflowJourney } from '../components/learning/WorkflowJourney'
import { useWorkspace } from '../hooks/useWorkspace'
import { consumeStudySetup, consumeStudyTab, readStudyEpisode, readStudySeek, STUDY_EPISODE_KEY } from '../lib/studyNavigation'
import { useI18n } from '../lib/i18n'
import type { StudySession } from '../types'

type StudyTab = 'transcript' | 'notes' | 'vocabulary' | 'handoff'

export function StudyView() {
  const { state, saveStudySession, saveVocabularyEntry } = useWorkspace()
  const { t } = useI18n()
  const [episodeId, setEpisodeId] = useState(() => {
    const stored = readStudyEpisode()
    if (state.episodes.some((episode) => episode.id === stored)) return stored
    return state.studySessions[0]?.episodeId ?? state.episodes.find((episode) => episode.status === 'queue' && episode.audioUrl)?.id ?? state.episodes[0]?.id ?? ''
  })
  const [activeTab, setActiveTab] = useState<StudyTab>(() => consumeStudyTab() ?? 'transcript')
  const [showSetup, setShowSetup] = useState(() => consumeStudySetup())
  const [selection, setSelection] = useState<WordSelection | null>(null)
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(() => {
    const seconds = readStudySeek()
    return seconds === null ? null : { seconds, nonce: Date.now() }
  })
  const [playback, setPlayback] = useState({ currentTime: 0, playing: false })
  const episode = state.episodes.find((item) => item.id === episodeId) ?? state.episodes[0] ?? null
  const activeEpisodeId = episode?.id ?? episodeId
  const show = episode ? state.shows.find((item) => item.id === episode.showId) ?? null : null
  const session = state.studySessions.find((item) => item.episodeId === activeEpisodeId)
  const entries = useMemo(() => state.vocabulary.filter((entry) => entry.episodeId === activeEpisodeId), [activeEpisodeId, state.vocabulary])
  const notes = useMemo(() => state.notes.filter((note) => note.episodeId === activeEpisodeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [activeEpisodeId, state.notes])

  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (state.episodes.some((item) => item.id === id)) {
        const seconds = readStudySeek()
        const requestedTab = consumeStudyTab()
        const requestedSetup = consumeStudySetup()
        setEpisodeId(id)
        setShowSetup(requestedSetup)
        setActiveTab(requestedTab ?? 'transcript')
        setSeekRequest(seconds === null ? null : { seconds, nonce: Date.now() })
      }
    }
    window.addEventListener('tingwen:select-episode', listener)
    return () => window.removeEventListener('tingwen:select-episode', listener)
  }, [state.episodes])

  const selectEpisode = (id: string) => {
    setEpisodeId(id)
    setShowSetup(false)
    setSelection(null)
    setSeekRequest(null)
    setPlayback({ currentTime: state.studySessions.find((item) => item.episodeId === id)?.positionSeconds ?? 0, playing: false })
    try { sessionStorage.setItem(STUDY_EPISODE_KEY, id) } catch { /* Selection still works for this render. */ }
  }

  const createSession = (next: StudySession) => {
    saveStudySession(next)
    setShowSetup(false)
    setActiveTab('transcript')
    setPlayback({ currentTime: 0, playing: false })
    toast.success(t(session ? 'Audio and transcript updated. Playback position reset.' : 'Your listening desk is ready for playback and word lookup.'))
  }

  const saveWord = (translation: string) => {
    if (!selection || !episode || !show) return
    saveVocabularyEntry({
      episodeId: episode.id,
      surface: selection.surface,
      translation,
      language: show.language,
      context: selection.context,
      startSeconds: selection.startSeconds,
    }, selection.entry?.id)
    toast.success(t(selection.entry ? 'Translation updated.' : '“{word}” saved to this episode’s vocabulary.', { word: selection.surface }))
    setSelection(null)
  }

  const locateWord = (seconds: number) => {
    setActiveTab('transcript')
    setSeekRequest({ seconds, nonce: Date.now() })
  }

  const locateNote = (seconds: number) => setSeekRequest({ seconds, nonce: Date.now() })

  return (
    <div className="page-wrap study-page">
      <PageHeader
        view="study"
        kicker={t('LISTEN / READ / RETAIN')}
        title={t('Hear the argument. Keep the language.')}
        copy={t('Align audio with a transcript, look up words in context, and capture timestamped notes without pausing. Private Snipd account data is never read.')}
        actions={episode && <label className="study-episode-picker"><span className="sr-only">{t('Choose an episode to study')}</span><select className="field" value={activeEpisodeId} onChange={(event) => selectEpisode(event.target.value)}>{state.episodes.map((item) => {
          const itemShow = state.shows.find((candidate) => candidate.id === item.showId)
          return <option key={item.id} value={item.id}>{itemShow?.shortName ?? t('Unknown')} · {item.title}</option>
        })}</select></label>}
      />

      {episode && show ? <>
        <EpisodeDossier episode={episode} />
        <WorkflowJourney episodeId={episode.id} current={!session || showSetup ? 'material' : activeTab === 'handoff' ? 'export' : 'transcript'} />
        <div className="study-now">
          <div className="study-now-meta"><span>{show.shortName}</span><span>{show.language}</span><span>{session ? t('{count} transcript segments', { count: session.segments.length }) : t('Listening desk not set up')}</span></div>
          <h2>{episode.title}</h2>
        </div>
        {(!session || showSetup) ? <div className="study-onboarding"><details className="study-request-fold"><summary>{t('Need a transcript? Prepare a KimiClaw request first (optional)')}</summary><TranscriptRequestPanel key={episode.id} episode={episode} show={show} /></details><StudySetup episode={episode} show={show} session={session} onSave={createSession} onCancel={session ? () => setShowSetup(false) : undefined} /></div> : <>
          <div className="study-tabs" role="tablist" aria-label={t('Listening workspace')}>
            <button type="button" role="tab" aria-selected={activeTab === 'transcript'} className={activeTab === 'transcript' ? 'active' : ''} onClick={() => setActiveTab('transcript')}><FileText size={16} />{t('Transcript')}</button>
            <button type="button" role="tab" aria-selected={activeTab === 'notes'} className={activeTab === 'notes' ? 'active' : ''} onClick={() => setActiveTab('notes')}><NotebookPen size={16} />{t('Notes')}<span>{notes.length}</span></button>
            <button type="button" role="tab" aria-selected={activeTab === 'vocabulary'} className={activeTab === 'vocabulary' ? 'active' : ''} onClick={() => setActiveTab('vocabulary')}><BookMarked size={16} />{t('Words')}<span>{entries.length}</span></button>
            <button type="button" role="tab" aria-selected={activeTab === 'handoff'} className={activeTab === 'handoff' ? 'active' : ''} onClick={() => setActiveTab('handoff')} title={t('Handoff')}><FileOutput size={16} />{t('Convert & export')}{session.completedAt && <i title={t('Playback completed')} />}</button>
          </div>
          <div hidden={activeTab !== 'transcript'}><StudyPlayer key={`${episode.id}-${session.audioMode}-${session.audioUrl}`} episode={episode} show={show} session={session} entries={entries} seekRequest={seekRequest} onOpenSetup={() => setShowSetup(true)} onWord={setSelection} onPlaybackChange={setPlayback} /></div>
          {activeTab === 'notes' && <NotesPanel episode={episode} notes={notes} currentTime={playback.currentTime} onSeek={locateNote} />}
          {activeTab === 'vocabulary' && <VocabularyPanel episode={episode} show={show} entries={entries} onEdit={setSelection} onLocate={locateWord} />}
          {activeTab === 'handoff' && <HandoffPanel key={episode.id} episode={episode} show={show} session={session} entries={entries} onOpenTimeline={() => setActiveTab('transcript')} />}
        </>}
        <div className="study-local-note"><AudioLines size={17} /><p>{t('Transcripts, vocabulary, notes, and playback positions are stored in localStorage. Local audio is stored separately in IndexedDB and is not included in JSON backups. Keep original audio files before clearing browser data.')}</p></div>
      </> : <div className="empty-state"><h3>{t('No episodes available for study')}</h3><p>{t('Add an episode manually in the inbox first.')}</p></div>}

      <WordDialog selection={selection} language={show?.language ?? 'English'} onClose={() => setSelection(null)} onSave={saveWord} />
    </div>
  )
}
