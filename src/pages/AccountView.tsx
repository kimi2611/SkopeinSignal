import { useEffect, useState } from 'react'
import { Cloud, HardDrive, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { CloudSyncPanel } from '../components/CloudSync'
import { PageHeader } from '../components/Common'
import { LearningFootprint } from '../components/LearningLoopNav'
import { PasswordSection } from '../components/PasswordSection'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { moduleTitle } from '../lib/themeTitles'
import { useI18n } from '../lib/i18n'
import type { ViewKey } from '../types'

export function AccountView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { user, isAuthenticated, refresh } = useAuth()
  const { state } = useWorkspace()
  const theme = state.settings.theme
  const { t } = useI18n()

  return (
    <div className="page-wrap account-page">
      <PageHeader
        view="account"
        kicker={t('MY ACCOUNT / PRIVATE CLOUD')}
        title={t(moduleTitle(theme, 'account'))}
        copy={t('Create or open your private account with Kimi. Your workspace follows your sign-in, while local audio remains on each device.')}
      />

      <section className="account-identity" aria-labelledby="account-identity-title">
        <div className="account-identity-mark"><UserRound size={28} /></div>
        <div className="account-identity-copy">
          <span className="section-index">{isAuthenticated ? t('SIGNED-IN ACCOUNT') : t('ACCOUNT NOT YET CONNECTED')}</span>
          <h2 id="account-identity-title">{isAuthenticated ? user?.name || user?.email || t('Kimi account') : t('Create my account')}</h2>
          <p>{isAuthenticated
            ? t('Kimi sign-in · {email}', { email: user?.email || t('Account email unavailable') })
            : t('Use “Sign in with Kimi” below. A successful first sign-in creates your private SkopeinSignal cloud workspace; there is no separate password to invent or store here.')}</p>
          {isAuthenticated && user && <DisplayNameEditor currentName={user.name || ''} onSaved={refresh} />}
        </div>
        <span className={`account-presence ${isAuthenticated ? 'is-online' : ''}`}><Cloud size={16} />{isAuthenticated ? t('Cloud account active') : t('Local workspace active')}</span>
      </section>

      <section className="settings-section account-cloud-section" aria-labelledby="account-cloud-title">
        <div className="settings-heading"><span>01</span><div><h2 id="account-cloud-title">{t('Account & cloud workspace')}</h2><p>{t('The same Kimi authentication and revision-checked cloud workspace used throughout SkopeinSignal—never a second, simulated account.')}</p></div></div>
        <CloudSyncPanel />
      </section>

      <section className="settings-section account-loop-section" aria-labelledby="account-loop-title">
        <div className="settings-heading"><span>02</span><div><h2 id="account-loop-title">{t('Learning footprint')}</h2><p>{t('FOUR MODULES · LATEST FIRST')}</p></div></div>
        <LearningFootprint view="account" onNavigate={onNavigate} />
      </section>

      <section className="settings-section account-password-section" aria-labelledby="account-password-title">
        <div className="settings-heading"><span>03</span><div><h2 id="account-password-title">{t('Change password')}</h2><p>{t('Verify the current one, choose a new one, and every signed-in device is dropped back to the sign-in screen.')}</p></div></div>
        <PasswordSection />
      </section>

      <div className="account-boundaries">
        <section><ShieldCheck size={21} /><div><h3>{t('Private by account')}</h3><p>{t('Cloud workspace requests are authenticated and isolated by user. Revision checks prevent an older device copy from silently replacing a newer one.')}</p></div></section>
        <section><HardDrive size={21} /><div><h3>{t('Audio stays on the device')}</h3><p>{t('Imported audio remains in this browser’s IndexedDB. It is excluded from cloud sync and JSON backup, so keep the original files and import them separately on each iPad.')}</p></div></section>
      </div>
    </div>
  )
}

function DisplayNameEditor({ currentName, onSaved }: { currentName: string; onSaved: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(currentName)
  const [busy, setBusy] = useState(false)
  useEffect(() => setName(currentName), [currentName])

  const save = async () => {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed || trimmed.length > 50) {
      toast.error(t('Name must be 1-50 characters.'))
      return
    }
    if (trimmed === currentName) return
    setBusy(true)
    try {
      const res = await fetch('/api/auth/local/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        toast.error(t(data?.error || 'Could not update the display name.'))
        return
      }
      toast.success(t('Display name updated.'))
      onSaved()
    } catch {
      toast.error(t('Could not update the display name.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-name-edit">
      <label className="field-label" htmlFor="display-name">{t('Display name')}</label>
      <div className="proxy-row">
        <input id="display-name" className="field" value={name} maxLength={50} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save() }} />
        <button type="button" className="btn btn-secondary" disabled={busy || !name.trim() || name.trim().replace(/\s+/g, ' ') === currentName} onClick={() => void save()}>{t('Save')}</button>
      </div>
      <p className="form-hint">{t('Shown across the atelier instead of your email. 1-50 characters.')}</p>
    </div>
  )
}
