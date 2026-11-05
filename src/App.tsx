import { Suspense, useEffect, useMemo, useState } from 'react'
import { AudioLines, CalendarDays, CircleHelp, Clock3, Inbox, Layers3, Library, Lightbulb, Menu, Mic, Music2, NotebookPen, ScanSearch, Settings, UserRound, X } from 'lucide-react'
import { Route, Routes } from 'react-router'
import { Toaster } from 'sonner'
import { WorkspaceProvider, useWorkspace } from './hooks/useWorkspace'
import { EpisodeActionsProvider } from './components/EpisodeActions'
import { EntranceOverlay } from './components/EntranceOverlay'
import { CloudAccountControl, CloudStatusBadge } from './components/CloudSync'
import { MusicMiniPlayer } from './components/MusicMiniPlayer'
import { TranscriptionStatus } from './components/TranscriptionStatus'
import { MusicPlayerProvider } from './hooks/useMusicPlayer'
import { findDuplicatePairs } from './lib/dedupe'
import { I18nProvider, useI18n } from './lib/i18n'
import { applyThemeChrome } from './lib/themeChrome'
import { MODULE_ORDER } from './lib/moduleOrder'
import { createRoute, prefetchOnIdle } from './lib/lazyRoute'
import { RouteBoundary } from './components/RouteBoundary'
const WeekView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/WeekView'), 'WeekView')
const InboxView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/InboxView'), 'InboxView')
const ShowsView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/ShowsView'), 'ShowsView')
const DedupeView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/DedupeView'), 'DedupeView')
const StudyView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/StudyView'), 'StudyView')
const QuizView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/QuizView'), 'QuizView')
const SparksView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/SparksView'), 'SparksView')
const GalleryView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/GalleryView'), 'GalleryView')
const NotesView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/NotesView'), 'NotesView')
const InsightsView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/InsightsView'), 'InsightsView')
const CardsView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/CardsView'), 'CardsView')
const GuideView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/GuideView'), 'GuideView')
const AccountView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/AccountView'), 'AccountView')
const SettingsView = createRoute<{ onNavigate?: (view: ViewKey) => void }>(() => import('./pages/SettingsView'), 'SettingsView')
const Login = createRoute(() => import('./pages/Login'))
const NotFound = createRoute(() => import('./pages/NotFound'))
import type { ViewKey } from './types'

/**
 * Retry hooks live next to the routes so the boundary never has to know which
 * component it is showing. A missing entry means "reload instead".
 */
const VIEW_RETRIES: Partial<Record<ViewKey, () => boolean>> = {
  week: WeekView.retry, inbox: InboxView.retry, shows: ShowsView.retry, dedupe: DedupeView.retry,
  insights: InsightsView.retry, study: StudyView.retry, quiz: QuizView.retry, sparks: SparksView.retry,
  cards: CardsView.retry, gallery: GalleryView.retry, notes: NotesView.retry, guide: GuideView.retry,
  account: AccountView.retry, settings: SettingsView.retry,
}


interface NavItem { key: ViewKey; label: string; english: string; icon: typeof CalendarDays }

const NAV_ITEM_DETAILS: Record<ViewKey, Omit<NavItem, 'key'>> = {
  week: { label: 'This Week', english: '4 LONG · 7 MEDIUM · 3 MICRO', icon: CalendarDays },
  inbox: { label: 'Inbox', english: 'TRIAGE', icon: Inbox },
  study: { label: 'Listen & Read', english: 'LANGUAGE DESK', icon: AudioLines },
  notes: { label: 'Notes', english: 'NOTEBOOK', icon: NotebookPen },
  quiz: { label: 'Voice Quiz', english: 'LISTENING CHECK', icon: Mic },
  cards: { label: 'Word Decks', english: 'LOCAL SPACED REVIEW', icon: Layers3 },
  insights: { label: 'Value Insights', english: 'TIMELY · EVERGREEN · REVIEW', icon: Clock3 },
  sparks: { label: 'Sparks', english: 'IDEA FEEDBACK', icon: Lightbulb },
  gallery: { label: 'Performance Room', english: 'BROWSING ONLY', icon: Music2 },
  shows: { label: 'Show Tiers', english: 'FOUR TIERS', icon: Library },
  dedupe: { label: 'Dedupe', english: 'HUMAN REVIEW', icon: ScanSearch },
  guide: { label: 'Guide', english: 'OPERATING MANUAL', icon: CircleHelp },
  account: { label: 'My Account', english: 'KIMI · CLOUD WORKSPACE', icon: UserRound },
  settings: { label: 'Settings', english: 'CLOUD & BACKUP', icon: Settings },
}

const NAV_ITEMS: NavItem[] = MODULE_ORDER.map((key) => ({ key, ...NAV_ITEM_DETAILS[key] }))

function getViewFromHash(): ViewKey {
  const key = window.location.hash.replace(/^#\/?/, '') as ViewKey
  return NAV_ITEMS.some((item) => item.key === key) ? key : 'week'
}

const WhisperLabView = createRoute(() => import('./pages/WhisperLabView'))

export default function App() {
  return <Routes>
    <Route path="/login" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Login /></Suspense>} />
    {/* Test-net bench: login-free on purpose, so a fresh iPad can probe its
        own Whisper capability before anyone signs in. Not in the navigation. */}
    <Route path="/whisper-lab" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><WhisperLabView /></Suspense>} />
    <Route path="/" element={<WorkspaceProvider><LocalizedApp /></WorkspaceProvider>} />
    <Route path="*" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><NotFound /></Suspense>} />
  </Routes>
}

function LocalizedApp() {
  const { state } = useWorkspace()
  useEffect(() => {
    applyThemeChrome(state.settings.theme)
    return () => { delete document.documentElement.dataset.theme }
  }, [state.settings.theme])
  return (
    <I18nProvider locale={state.settings.uiLocale}>
      <MusicPlayerProvider>
        <EpisodeActionsProvider>
          <AppShell />
          <Toaster position="bottom-center" closeButton toastOptions={{ className: 'app-toast' }} />
        </EpisodeActionsProvider>
      </MusicPlayerProvider>
    </I18nProvider>
  )
}

function RouteFallback() {
  const { t } = useI18n()
  return <div className="route-loading" role="status"><span className="spin" aria-hidden="true" />{t('Opening this module…')}</div>
}

function AppShell() {
  const { storageError } = useWorkspace()
  const { t, locale } = useI18n()
  const [view, setView] = useState<ViewKey>(getViewFromHash)
  const [menuOpen, setMenuOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#/week')
    const onHash = () => { setView(getViewFromHash()); setMenuOpen(false); window.scrollTo(0, 0) }
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    // Warm the route chunks while the browser is idle: a click should never be
    // the thing that starts a network round trip to a possibly sleeping path.
    return prefetchOnIdle([
      () => import('./pages/StudyView'),
      () => import('./pages/SettingsView'),
      () => import('./pages/GuideView'),
      () => import('./pages/GalleryView'),
      () => import('./pages/AccountView'),
      () => import('./pages/InboxView'),
      () => import('./pages/CardsView'),
      () => import('./pages/NotesView'),
      () => import('./pages/QuizView'),
      () => import('./pages/SparksView'),
      () => import('./pages/ShowsView'),
      () => import('./pages/DedupeView'),
      () => import('./pages/InsightsView'),
    ])
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const navigate = (next: ViewKey) => {
    setMenuOpen(false)
    if (next === view) { window.scrollTo(0, 0); return }
    window.location.hash = `/${next}`
  }

  return (
    <><EntranceOverlay /><div className="app-shell">
      <aside className="sidebar"><SidebarContent view={view} onNavigate={navigate} /></aside>
      <header className="mobile-header">
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(true)} aria-label={t('Open navigation')}><Menu size={21} /></button>
        <button type="button" className="mobile-brand" onClick={() => navigate('week')}>{t('SkopeinSignal')}<span>{t('Podcast Learning Atelier')}</span></button>
        <CloudStatusBadge compact />
      </header>
      {menuOpen && <div className="mobile-nav-layer"><button type="button" className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-label={t('Close navigation')} /><aside className="mobile-drawer"><button type="button" className="btn btn-ghost btn-icon drawer-close" onClick={() => setMenuOpen(false)} aria-label={t('Close navigation')}><X size={20} /></button><SidebarContent view={view} onNavigate={navigate} /></aside></div>}
      <div className="workspace">
        {storageError && <div className="storage-error global-storage-error" role="alert">{t(storageError)}</div>}
        {!online && <div className="offline-banner" role="status">{t('You are offline. Existing workspace data remains available; RSS updates require a connection.')}</div>}
        <div className="periodical-bar"><span>{t('PRIVATE LEARNING EDITION')}</span><span>{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span></div>
        <RouteBoundary resetKey={view} onRetry={() => VIEW_RETRIES[view]?.() ?? false}>
        <Suspense fallback={<RouteFallback />}>
          {view === 'week' && <WeekView onNavigate={navigate} />}
          {view === 'inbox' && <InboxView onNavigate={navigate} />}
          {view === 'shows' && <ShowsView />}
          {view === 'dedupe' && <DedupeView />}
          {view === 'insights' && <InsightsView />}
          {view === 'study' && <StudyView />}
          {view === 'quiz' && <QuizView onNavigate={navigate} />}
          {view === 'sparks' && <SparksView onNavigate={navigate} />}
          {view === 'cards' && <CardsView />}
          {view === 'gallery' && <GalleryView />}
          {view === 'notes' && <NotesView onNavigate={navigate} />}
          {view === 'guide' && <GuideView onNavigate={navigate} />}
          {view === 'account' && <AccountView onNavigate={navigate} />}
          {view === 'settings' && <SettingsView />}
        </Suspense>
        </RouteBoundary>
      </div>
    </div><TranscriptionStatus view={view} onNavigate={navigate} /><MusicMiniPlayer view={view} onNavigate={navigate} /></>
  )
}

function SidebarContent({ view, onNavigate }: { view: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const { state } = useWorkspace()
  const { t } = useI18n()
  const inboxCount = state.episodes.filter((episode) => episode.status === 'inbox').length
  const queueCount = state.episodes.filter((episode) => episode.status === 'queue').length
  const duplicateCount = useMemo(() => findDuplicatePairs(state.episodes, state.dismissedPairs).length, [state.episodes, state.dismissedPairs])
  const countFor = (key: ViewKey) => key === 'inbox' ? inboxCount : key === 'week' ? queueCount : key === 'dedupe' ? duplicateCount : key === 'notes' ? state.notes.length : null

  return (
    <div className="sidebar-inner">
      <button type="button" className="brand" onClick={() => onNavigate('week')}><span className="brand-name">{t('SkopeinSignal')}</span><span className="brand-copy">{t('Private Podcast Learning Atelier')}</span><span className="brand-edition">{t('OBSERVE · LISTEN · INQUIRE · REMEMBER')}</span></button>
      <nav className="main-nav" aria-label={t('Workspace navigation')}>{NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const count = countFor(item.key)
        return <button type="button" key={item.key} className={`nav-item ${view === item.key ? 'active' : ''}`} onClick={() => onNavigate(item.key)} aria-current={view === item.key ? 'page' : undefined}><Icon size={18} /><span><strong>{t(item.label)}</strong><small>{t(item.english)}</small></span>{count !== null && count > 0 && <b>{count}</b>}</button>
      })}
      </nav>
      <div className="sidebar-tiers"><div className="section-kicker">{t('FOUR TIERS')}</div>{(['radar', 'main', 'supplement', 'archive'] as const).map((tier, index) => <div key={tier}><span>{['00', '10', '20', '30'][index]}</span><p>{t(['Signal Radar', 'Core Threads', 'Selective Listening', 'Reference Library'][index])}</p><strong>{state.shows.filter((show) => show.tier === tier).length}</strong></div>)}</div>
      <div className="sidebar-foot"><CloudAccountControl /></div>
    </div>
  )
}
