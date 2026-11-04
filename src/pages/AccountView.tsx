import { Cloud, HardDrive, ShieldCheck, UserRound } from 'lucide-react'
import { CloudSyncPanel } from '../components/CloudSync'
import { PageHeader } from '../components/Common'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../lib/i18n'

export function AccountView() {
  const { user, isAuthenticated } = useAuth()
  const { t } = useI18n()

  return (
    <div className="page-wrap account-page">
      <PageHeader
        view="account"
        kicker={t('MY ACCOUNT / PRIVATE CLOUD')}
        title={t('Your atelier, under your name.')}
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
        </div>
        <span className={`account-presence ${isAuthenticated ? 'is-online' : ''}`}><Cloud size={16} />{isAuthenticated ? t('Cloud account active') : t('Local workspace active')}</span>
      </section>

      <section className="settings-section account-cloud-section" aria-labelledby="account-cloud-title">
        <div className="settings-heading"><span>01</span><div><h2 id="account-cloud-title">{t('Account & cloud workspace')}</h2><p>{t('The same Kimi authentication and revision-checked cloud workspace used throughout SkopeinSignal—never a second, simulated account.')}</p></div></div>
        <CloudSyncPanel />
      </section>

      <div className="account-boundaries">
        <section><ShieldCheck size={21} /><div><h3>{t('Private by account')}</h3><p>{t('Cloud workspace requests are authenticated and isolated by user. Revision checks prevent an older device copy from silently replacing a newer one.')}</p></div></section>
        <section><HardDrive size={21} /><div><h3>{t('Audio stays on the device')}</h3><p>{t('Imported audio remains in this browser’s IndexedDB. It is excluded from cloud sync and JSON backup, so keep the original files and import them separately on each iPad.')}</p></div></section>
      </div>
    </div>
  )
}
