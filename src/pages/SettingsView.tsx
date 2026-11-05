import { useEffect, useRef, useState } from 'react'
import { BookOpen, CheckCircle2, Cloud, Database, Download, HardDrive, Mic, RotateCcw, ShieldCheck, Upload, Wifi, WifiOff, Wrench, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FeedProgress, PageHeader, RefreshButton } from '../components/Common'
import { CloudSyncPanel } from '../components/CloudSync'
import { ByokPanel } from '../components/ByokPanel'
import TranscriptionPanel from '../components/TranscriptionPanel'
import { REPLAY_ENTRANCE_EVENT } from '../components/EntranceOverlay'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAuth } from '../hooks/useAuth'
import { formatDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { publicHttpUrlError } from '../lib/publicUrl'
import { navigateToHash } from '../lib/studyNavigation'
import type { FeedState, UiLocale } from '../types'

export function SettingsView() {
  const { state, updateSettings, importWorkspace, resetWorkspace, refreshFeeds, refreshProgress } = useWorkspace()
  const { t } = useI18n()
  const [proxy, setProxy] = useState(state.settings.proxyUrl)
  const [proxyError, setProxyError] = useState('')
  const [backupReceipt, setBackupReceipt] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const exportBackup = () => {
    const filename = `SkopeinSignal-backup-${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    const receipt = t('JSON backup download started: {filename}. It contains the text workspace but no audio. Confirm the file in Downloads or Files and keep original audio separately.', { filename })
    setBackupReceipt(receipt)
    toast.success(receipt)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const result = importWorkspace(parsed)
      if (result.ok) toast.success(t(result.message))
      else toast.error(t(result.message))
    } catch {
      toast.error(t('Could not read this file. Choose a JSON backup exported by SkopeinSignal.'))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const reset = () => {
    if (!window.confirm(t('Reset the entire workspace on this device and, when cloud sync is active, in your account? Show edits, episode states, notes, and statistics will return to their initial values. This cannot be undone; export a backup first.'))) return
    resetWorkspace()
    setProxy('https://api.allorigins.win/raw?url=')
    toast.success(t('Workspace restored to its initial state.'))
  }

  const failedShows = state.shows.filter((show) => state.feedStatus[show.id]?.status === 'error')
  const feedMessage = (feed: FeedState) => {
    if (feed.status === 'success') {
      return feed.addedCount
        ? t('{count} new episodes added to the inbox', { count: feed.addedCount })
        : t('Feed read successfully; no new episodes')
    }
    const httpFailure = feed.message.match(/^Request failed \(HTTP (\d+)\)$/)
    if (httpFailure) return t('Request failed (HTTP {status})', { status: httpFailure[1] })
    switch (feed.message) {
      case 'Request timed out; retry later or add the episode manually': return t('Request timed out; retry later or add the episode manually')
      case 'Network or CORS restriction; change the proxy, request directly, or add manually': return t('Network or CORS restriction; change the proxy, request directly, or add manually')
      case 'No RSS URL is configured for this show': return t('No RSS URL is configured for this show')
      case 'The response is not valid RSS / Atom XML': return t('The response is not valid RSS / Atom XML')
      case 'No episodes were found in this feed': return t('No episodes were found in this feed')
      case 'Feed episodes have no usable titles': return t('Feed episodes have no usable titles')
      case 'The JSON bridge did not return episodes': return t('The JSON bridge did not return episodes')
      case 'The feed could not be read': return t('The feed could not be read')
      case 'This show’s feed could not be read': return t('This show’s feed could not be read')
      default: return feed.message
    }
  }
  const repairAllFailed = async () => {
    if (!failedShows.length || refreshProgress.active) return
    const result = await refreshFeeds(failedShows.map((show) => show.id), { recovery: true })
    if (!result.failed) {
      toast.success(t('All previously failed feeds are now reading successfully.'))
      return
    }
    toast.warning(t('{count} feeds still need attention. Use each row’s Repair button to correct its address.', { count: result.failed }))
  }

  return (
    <div className="page-wrap settings-page">
      <PageHeader view="settings" kicker={t('SETTINGS / CLOUD & LOCAL')} title={t('Your rules. Your data.')} copy={t('Sign in to sync your private workspace across devices. No private Snipd data is accessed, and local audio always remains on this device.')} actions={<button type="button" className="btn btn-primary" onClick={exportBackup}><Download size={16} />{t('Export JSON (no audio)')}</button>} />
      <div className="settings-grid">
        <section className="settings-section">
          <div className="settings-heading"><span>00</span><div><h2>{t('Interface language')}</h2><p>{t('Choose the language of controls, guidance, dialogs, and notifications.')}</p></div></div>
          <label className="field-label" htmlFor="ui-language">{t('Website language')}</label>
          <select id="ui-language" className="field" value={state.settings.uiLocale} onChange={(event) => updateSettings({ uiLocale: event.target.value as UiLocale })}><option value="en">English</option><option value="zh-CN">中文</option><option value="de">Deutsch</option></select>
          <p className="form-hint">{t('English remains the default. This setting does not translate podcast titles, transcripts, notes, or the language of the show itself.')}</p>
        </section>

        <section className="settings-section">
          <div className="settings-heading"><span>01</span><div><h2>{t('Weekly quotas')}</h2><p>{t('Quotas are attention budgets, not tasks you must fill.')}</p></div></div>
          <div className="settings-fields three-fields">
            <NumberField label={t('Long-interview cap')} value={state.settings.longCap} min={1} max={12} onChange={(value) => updateSettings({ longCap: value })} />
            <NumberField label={t('Medium-episode cap')} value={state.settings.mediumCap} min={1} max={20} onChange={(value) => updateSettings({ mediumCap: value })} />
            <NumberField label={t('Micro-discussion cap')} value={state.settings.microCap} min={1} max={20} onChange={(value) => updateSettings({ microCap: value })} />
          </div>
          <p className="form-hint">{t('Duration rules: micro ≤ 30 minutes; medium > 30 and ≤ 60 minutes; long > 60 minutes. Unknown durations are treated as long until verified.')}</p>
          <label className="switch-row"><span><strong>{t('Check RSS automatically each day')}</strong><small>{t('Check feeds on the first opening each day; manual refresh is always available.')}</small></span><input type="checkbox" role="switch" checked={state.settings.autoRefresh} onChange={(event) => updateSettings({ autoRefresh: event.target.checked })} /></label>
        </section>

        <section className="settings-section">
          <div className="settings-heading"><span>02</span><div><h2>{t('Cloud sync, backup & restore')}</h2><p>{t('Signed-in workspaces save automatically to your account. JSON export and import remain available for manual backups and migration.')}</p></div></div>
          <CloudSyncPanel />
          <div className="local-warning"><HardDrive size={20} /><p><strong>{t('Cloud JSON, local audio')}</strong><br />{t('When signed in, shows, transcripts, vocabulary, notes, imported Kimi summaries, card schedules, and playback positions sync to your account and remain cached in this browser. Local audio is separate in IndexedDB and excluded from both cloud sync and JSON backups. Export a backup and keep original audio before clearing site data.')}</p></div>
          <div className="backup-actions"><button type="button" className="btn btn-secondary" onClick={exportBackup}><Download size={16} />{t('Export JSON (no audio)')}</button><button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}><Upload size={16} />{t('Import JSON')}</button><input ref={fileInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></div>
          {backupReceipt && <p className="backup-receipt" role="status">{backupReceipt}</p>}
          <button type="button" className="danger-link" onClick={reset}><RotateCcw size={15} />{t('Reset to initial workspace')}</button>
        </section>

        <TranscriptionPanel />

        <ReliabilityPanel />

        <details className="settings-section settings-advanced">
          <summary><span className="settings-heading"><span>04</span><div><h2>{t('RSS networking (advanced)')}</h2><p>{t('Only touch this when feeds keep failing: every refresh already tries the direct address, your proxy, backup public proxies, and a JSON bridge in sequence, so a failed request does not mean a show has stopped.')}</p></div></span></summary>
          <label className="field-label" htmlFor="proxy-url">{t('CORS proxy prefix used after a direct request fails; leave empty for direct requests only')}</label>
          <div className="proxy-row"><input id="proxy-url" className="field" value={proxy} onChange={(event) => { setProxy(event.target.value); setProxyError('') }} placeholder={t('Leave empty to request public RSS directly')} /><button type="button" className="btn btn-secondary" onClick={() => { const urlError = publicHttpUrlError(proxy, true); if (urlError) { setProxyError(t(urlError)); return } setProxyError(''); updateSettings({ proxyUrl: proxy.trim() }); toast.success(t(proxy.trim() ? 'Proxy settings saved.' : 'Switched to direct requests.')) }}>{t('Save')}</button></div>
          {proxyError && <p className="form-error" role="alert">{proxyError}</p>}
          <p className="form-hint">{t('Refresh tries the public feed directly, then AllOrigins after a failure. Never put account names, tokens, or private subscription parameters in RSS URLs; add episodes manually when offline.')}</p>
        </details>

        <section className="settings-section">
          <div className="settings-heading"><span>05</span><div><h2>{t('Extras')}</h2><p>{t('Install the atelier on an iPad Home Screen, or replay the quiet curtain opening.')}</p></div></div>
          <ol className="install-steps"><li>{t('Open this preview or your published address in Safari.')}</li><li>{t('Tap Safari’s Share button.')}</li><li>{t('Choose Add to Home Screen and name it SkopeinSignal.')}</li><li>{t('Open from the Home Screen for a standalone-window experience.')}</li></ol>
          <div className="local-warning"><ShieldCheck size={20} /><p><strong>{t('Boundaries with Snipd, KimiClaw, and LinguaCafe')}</strong><br />{t('Import transcripts you exported yourself and keep using Snipd; no private passwords are stored. The listening desk creates handoff files, but never reports a local download as a confirmed KimiClaw write or LinguaCafe import.')}</p></div>
          <button type="button" className="btn btn-secondary" onClick={() => window.dispatchEvent(new Event(REPLAY_ENTRANCE_EVENT))}><RotateCcw size={16} />{t('Replay entrance')}</button>
          <p className="form-hint">{t('The entrance never starts audio, and reduced-motion preferences are respected.')}</p>
        </section>

        <ByokPanel />
      </div>

      <section className="feed-status-section">
        <div className="section-heading"><div><span className="section-index">06</span><h2>{t('Feed status')}</h2></div><div className="feed-status-actions"><span className="section-count">{t('{count} public feeds', { count: state.shows.length })}</span>{!!failedShows.length && <button type="button" className="btn btn-secondary feed-repair-all-button" disabled={refreshProgress.active} onClick={() => void repairAllFailed()}><Wrench size={15} />{t('Repair all failed ({count})', { count: failedShows.length })}</button>}<RefreshButton secondary label="Refresh all feeds" /></div></div>
        {!!failedShows.length && <p className="feed-repair-all-copy">{t('Repair all failed retries only the failed feeds through up to three rounds of direct, custom and backup proxies, the alternate address, and JSON recovery without removing any episodes. Temporary network failures pause briefly between rounds; permanent address or RSS errors stop early. Feeds that still fail keep their individual Repair button for address correction in Show Tiers.')}</p>}
        <FeedProgress />
        <div className="feed-status-list">{state.shows.map((show) => {
          const feed = state.feedStatus[show.id]
          const checking = refreshProgress.active && refreshProgress.currentShowId === show.id
          return <div className={`feed-status-row ${checking ? 'is-checking' : ''}`} key={show.id}><div><strong>{show.shortName}</strong><span>{checking ? t('Checking this feed now…') : feed ? `${formatDate(feed.updatedAt, true)} · ${feedMessage(feed)}` : t('Not yet refreshed')}</span></div><div className="feed-status-row-actions">{feed?.status === 'success' ? <CheckCircle2 className="success-icon" size={18} aria-label={t('Success')} /> : feed?.status === 'error' ? <XCircle className="error-icon" size={18} aria-label={t('Failed')} /> : <span className="status-dash">—</span>}<RefreshButton showIds={[show.id]} secondary label="Refresh" />{feed?.status === 'error' && <button type="button" className="btn btn-ghost feed-repair-button" title={t('Open Show Tiers to correct this feed address')} onClick={() => navigateToHash('/shows')}><Wrench size={14} />{t('Repair')}</button>}</div></div>
        })}</div>
      </section>
    </div>
  )
}

function ReliabilityPanel() {
  const { state } = useWorkspace()
  const { isAuthenticated } = useAuth()
  const { t } = useI18n()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [shellReady, setShellReady] = useState(() => Boolean(navigator.serviceWorker?.controller))

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      setShellReady(Boolean(navigator.serviceWorker?.controller))
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    navigator.serviceWorker?.addEventListener('controllerchange', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      navigator.serviceWorker?.removeEventListener('controllerchange', update)
    }
  }, [])

  const speechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  const localAudioSupported = typeof indexedDB !== 'undefined'
  const rssMode = state.settings.proxyUrl.trim() ? t('Direct feed, then your proxy, backup proxies, and a JSON bridge') : t('Direct feed, then built-in backup proxies and a JSON bridge')

  const copyDiagnostics = async () => {
    const diagnostics = {
      checkedAt: new Date().toISOString(),
      online,
      serviceWorkerActive: shellReady,
      localAudioIndexedDb: localAudioSupported,
      speechRecognition: speechSupported,
      signedIn: isAuthenticated,
      proxyConfigured: Boolean(state.settings.proxyUrl.trim()),
      userAgent: navigator.userAgent,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2))
      toast.success(t('Diagnostics copied. They contain no passwords, workspace content, or account tokens.'))
    } catch {
      toast.error(t('Clipboard access was unavailable. The diagnostics remain visible on this page.'))
    }
  }

  return <section className="settings-section reliability-panel">
    <div className="settings-heading"><span>03</span><div><h2>{t('Reliability, offline state & dependencies')}</h2><p>{t('Know exactly what works offline, what needs the network, and which fallback to use when an outside service fails.')}</p></div></div>
    <div className="dependency-grid">
      <div className={`dependency-card ${online ? 'is-ready' : 'is-warning'}`}>{online ? <Wifi size={19} /> : <WifiOff size={19} />}<strong>{t('Network')}</strong><span>{online ? t('Online') : t('Offline — saved workspace and imported transcripts remain readable')}</span></div>
      <div className={`dependency-card ${shellReady ? 'is-ready' : 'is-warning'}`}>{shellReady ? <CheckCircle2 size={19} /> : <XCircle size={19} />}<strong>{t('Offline app shell')}</strong><span>{shellReady ? t('Installed shell active; already visited modules can reopen') : t('Not active yet — install and open the app once while online')}</span></div>
      <div className={`dependency-card ${localAudioSupported ? 'is-ready' : 'is-warning'}`}><HardDrive size={19} /><strong>{t('Local audio')}</strong><span>{localAudioSupported ? t('IndexedDB available; audio stays on this device and can be re-linked after cloud sync') : t('IndexedDB unavailable — use RSS audio or a transcript')}</span></div>
      <div className={`dependency-card ${speechSupported ? 'is-ready' : 'is-warning'}`}><Mic size={19} /><strong>{t('Web Speech')}</strong><span>{speechSupported ? t('Available in this browser') : t('Unavailable here — type answers or open Chrome, Edge, or Safari on iPad')}</span></div>
      <div className={`dependency-card ${online && isAuthenticated ? 'is-ready' : 'is-warning'}`}><Cloud size={19} /><strong>{t('AI & cloud sync')}</strong><span>{online && isAuthenticated ? t('Signed in and online; no failed AI request is retried automatically') : t('Requires both Kimi sign-in and network; local reading continues without it')}</span></div>
      <div className={`dependency-card ${online ? 'is-ready' : 'is-warning'}`}><BookOpen size={19} /><strong>{t('OpenAlex / Crossref')}</strong><span>{online ? t('Online scholarly lookup; saved reports remain available offline') : t('Offline — reopen saved reports or use Notes')}</span></div>
    </div>
    <div className="dependency-notes">
      <p><Database size={16} />{t('RSS status')}: {rssMode}. {t('If a feed fails, episodes already in the inbox are never erased; manual episode entry remains available.')}</p>
      <p>{t('On-device transcription uses bundled model files, but they are deliberately kept out of the offline cache because iPadOS cache quotas are small. A first offline launch cannot be promised; load the transcription setup once while online, and imported transcripts always remain the fallback.')}</p>
      <p>{t('If Safari suspends or reloads a long transcription on iPadOS, the application-level job keeps its progress state where possible and the unfinished setup draft is restored. Keep the tab in the foreground for long recognition runs.')}</p>
    </div>
    <button type="button" className="btn btn-secondary" onClick={() => void copyDiagnostics()}><ShieldCheck size={16} />{t('Copy reliability diagnostics')}</button>
  </section>
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="form-stack"><span className="field-label">{label}</span><input className="field" type="number" min={min} max={max} value={value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next)))) }} /></label>
}
