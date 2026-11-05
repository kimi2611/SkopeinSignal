import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Cloud, CloudOff, HardDriveUpload, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { useI18n } from '../lib/i18n'
import { LOGIN_PATH } from '../const'
import type { CloudSyncStatus } from '../hooks/useCloudWorkspace'

const STATUS_LABELS: Record<CloudSyncStatus, string> = {
  disabled: 'This browser only',
  loading: 'Connecting to cloud',
  migration: 'Migration needed',
  saving: 'Saving to cloud',
  synced: 'Cloud synced',
  error: 'Sync needs attention',
  conflict: 'Revision conflict',
}

const CLOUD_WORKSPACE_LIMIT_BYTES = 12 * 1024 * 1024

export function CloudStatusBadge({ compact = false }: { compact?: boolean }) {
  const { cloud } = useWorkspace()
  const { t } = useI18n()
  const Icon = cloud.status === 'synced' ? Cloud : cloud.status === 'disabled' ? CloudOff : cloud.status === 'error' || cloud.status === 'conflict' ? AlertTriangle : RefreshCw
  return <span className={`cloud-status-badge is-${cloud.status} ${compact ? 'is-compact' : ''}`}><Icon size={compact ? 14 : 16} className={cloud.status === 'loading' || cloud.status === 'saving' ? 'spin-soft' : ''} /><span>{t(STATUS_LABELS[cloud.status])}</span></span>
}

export function CloudAccountControl() {
  const { cloud } = useWorkspace()
  const { user, isAuthenticated, logout } = useAuth()
  const { t } = useI18n()
  if (!isAuthenticated) {
    return <button type="button" className="cloud-account-control" onClick={() => { window.location.hash = '/account' }}><CloudOff size={15} /><span>{t('My account')}<small>{t('Create or sign in for cloud sync')}</small></span><LogIn size={14} /></button>
  }
  return <div className="cloud-account-control is-signed-in"><button type="button" className="cloud-account-open" onClick={() => { window.location.hash = '/account' }}><Cloud size={15} /><span title={user?.email ?? user?.name ?? undefined}>{t('My account')}<small>{user?.name || user?.email || t(STATUS_LABELS[cloud.status])}</small></span></button><button type="button" className="cloud-logout" onClick={() => void logout()} aria-label={t('Sign out')} title={t('Sign out')}><LogOut size={14} /></button></div>
}

export function CloudSyncPanel() {
  const { cloud, state } = useWorkspace()
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [deviceStorage, setDeviceStorage] = useState<{ usage: number; quota: number } | null>(null)
  const payloadBytes = useMemo(() => new Blob([JSON.stringify(state)]).size, [state])
  const payloadPercent = Math.min(100, Math.round((payloadBytes / CLOUD_WORKSPACE_LIMIT_BYTES) * 100))
  const cloudErrorLabels: Record<string, string> = {
    'The cloud workspace is not a valid SkopeinSignal backup. Your device copy has not been replaced.': t('The cloud workspace is not a valid SkopeinSignal backup. Your device copy has not been replaced.'),
    'Cloud sync could not be reached. Your changes remain on this device; retry when the connection is available.': t('Cloud sync could not be reached. Your changes remain on this device; retry when the connection is available.'),
    'Another device saved a newer cloud revision. Choose which workspace to keep; nothing has been overwritten automatically.': t('Another device saved a newer cloud revision. Choose which workspace to keep; nothing has been overwritten automatically.'),
    'Changes are saved on this device but have not reached the cloud. Check your connection and retry.': t('Changes are saved on this device but have not reached the cloud. Check your connection and retry.'),
    'Cloud sync is still unavailable. Your device copy is unchanged.': t('Cloud sync is still unavailable. Your device copy is unchanged.'),
  }

  useEffect(() => {
    let cancelled = false
    void navigator.storage?.estimate?.().then((estimate) => {
      if (!cancelled && typeof estimate.usage === 'number' && typeof estimate.quota === 'number') setDeviceStorage({ usage: estimate.usage, quota: estimate.quota })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const run = async (action: () => Promise<boolean>, success: string) => {
    setBusy(true)
    try {
      const ok = await action()
      if (ok) toast.success(success)
      else if (cloud.status !== 'conflict') toast.error(t('Cloud action was not completed. Your device copy is unchanged.'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="cloud-sync-panel">
    <div className="cloud-sync-summary">
      <div className="cloud-sync-icon">{isAuthenticated ? <Cloud size={24} /> : <CloudOff size={24} />}</div>
      <div><CloudStatusBadge /><p>{isAuthenticated ? t('Signed in as {name}. Show edits, episodes, transcripts, vocabulary, notes, summaries, understanding records, research reports, idea evolution, card schedules, and playback positions sync to your private account workspace.', { name: user?.name || user?.email || t('Account') }) : t('You can keep working locally. Sign in to load and save a private cloud workspace across your devices.')}</p></div>
    </div>

    <div className={`cloud-capacity ${payloadPercent >= 90 ? 'is-warning' : ''}`}>
      <div><span>{t('Cloud workspace size')}</span><strong>{(payloadBytes / 1024 / 1024).toFixed(2)} MB / 12 MB</strong></div>
      <progress value={payloadBytes} max={CLOUD_WORKSPACE_LIMIT_BYTES} />
      <small>{payloadPercent >= 90 ? t('Nearly full. Export a JSON backup, then remove unneeded transcripts, notes, or research reports before the next save.') : t('Workspace JSON fits within the 12 MB private cloud save limit.')}</small>
      {deviceStorage && <small>{t('Browser storage used: {used} MB of about {quota} MB available to this site.', { used: (deviceStorage.usage / 1024 / 1024).toFixed(1), quota: (deviceStorage.quota / 1024 / 1024).toFixed(0) })}</small>}
    </div>

    {!isAuthenticated && <div className="backup-actions"><button type="button" className="btn btn-primary" disabled={isLoading} onClick={() => window.location.assign(LOGIN_PATH)}><LogIn size={16} />{t('Sign in')}</button></div>}

    {isAuthenticated && <>
      <div className="cloud-sync-meta"><span>{t('Revision {number}', { number: cloud.revision })}</span><span>{cloud.lastSyncedAt ? t('Last cloud save {date}', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(cloud.lastSyncedAt)) }) : t('No cloud save yet')}</span></div>
      {cloud.status === 'migration' && <div className="cloud-migration" role="status"><HardDriveUpload size={22} /><div><h3>{t('Move this browser workspace to the cloud?')}</h3><p>{t('This account has no cloud workspace yet. Upload the workspace currently on this device, or start with a fresh cloud workspace. Local audio files are never included.')}</p><div className="backup-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(cloud.connectLocalToCloud, t('This device workspace is now syncing to your account.'))}><HardDriveUpload size={16} />{t('Sync this device workspace')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { if (window.confirm(t('Start with a fresh cloud workspace? Export this device workspace first if you want to keep it.'))) void run(cloud.startFreshCloud, t('A fresh cloud workspace is ready.')) }}>{t('Start fresh in cloud')}</button></div></div></div>}
      {cloud.status === 'conflict' && <div className="cloud-conflict" role="alert"><AlertTriangle size={22} /><div><h3>{t('Choose which workspace to keep')}</h3><p>{t('The cloud changed after this device loaded its copy. Using the cloud version preserves a pre-replacement device snapshot when browser storage allows. Keeping this device version saves it as the next cloud revision.')}</p><div className="backup-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => { if (cloud.useCloudVersion()) toast.success(t('Cloud workspace loaded on this device.')); else toast.error(t('The cloud version is invalid. Your device copy is unchanged.')) }}><Cloud size={16} />{t('Use cloud version')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(cloud.keepDeviceVersion, t('This device version was saved as the newest cloud revision.'))}><HardDriveUpload size={16} />{t('Keep this device version')}</button></div></div></div>}
      {cloud.error && <div className="cloud-sync-error" role="alert"><AlertTriangle size={18} /><p>{cloudErrorLabels[cloud.error] ?? t('Cloud sync failed. Your device copy is unchanged; review the connection and retry.')}</p></div>}
      <div className="backup-actions"><button type="button" className="btn btn-secondary" disabled={busy || cloud.status === 'loading' || cloud.status === 'migration' || cloud.status === 'conflict'} onClick={() => void run(cloud.status === 'error' ? cloud.retryCloud : cloud.saveNow, t('Workspace synchronized with your cloud account.'))}><RefreshCw size={16} />{cloud.status === 'error' ? t('Retry cloud sync') : t('Sync now')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void logout()}><LogOut size={16} />{t('Sign out')}</button>{cloud.status === 'synced' && <span className="cloud-confirmed"><Check size={15} />{t('Automatic saving is on')}</span>}</div>
    </>}

    <p className="form-hint">{t('Cloud sync covers workspace JSON only. Local audio remains in this browser’s IndexedDB and never enters the cloud save; keep the original audio files separately. No Snipd, KimiClaw, or LinguaCafe passwords are requested or stored.')}</p>
  </div>
}
